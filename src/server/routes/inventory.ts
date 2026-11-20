import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  businessSettings,
  categories,
  products,
  stockMovements,
  users,
} from '../../db/schema.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { generateRefNumber, num, toMoney, writeAuditLog } from '../helpers.ts';

export const inventoryRouter = Router();

// Categories
inventoryRouter.get('/categories', async (_req, res) => {
  try {
    const rows = await db.select().from(categories).orderBy(categories.sortOrder);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

inventoryRouter.post('/categories', async (req: AuthRequest, res) => {
  try {
    const { name, burmeseName, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    const [created] = await db
      .insert(categories)
      .values({
        name: name.trim(),
        burmeseName: burmeseName || name.trim(),
        description: description || '',
      })
      .returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create category.' });
  }
});

// List Products with Category Join
inventoryRouter.get('/products', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const [prodRows, catRows] = await Promise.all([
      db.select().from(products).orderBy(desc(products.createdAt)),
      db.select().from(categories),
    ]);
    const catMap = new Map(catRows.map((c) => [c.id, c]));

    const result = prodRows
      .filter((p) => includeInactive || p.isActive)
      .map((p) => {
        const cat = p.categoryId ? catMap.get(p.categoryId) : null;
        const stock = num(p.currentStock);
        const stockStatus =
          stock <= 0 ? 'out_of_stock' : stock <= p.minStockLevel ? 'low_stock' : 'in_stock';
        return {
          ...p,
          categoryName: cat?.name || 'Uncategorized',
          categoryBurmeseName: cat?.burmeseName || '',
          stockStatus,
          stockValue: stock * num(p.weightedAvgCost),
        };
      });

    res.json(result);
  } catch (error) {
    console.error('Products list failed:', error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

// Create Product (with optional opening stock -> creates auditable stock_movement)
inventoryRouter.post('/products', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.sku || !b.name) {
      return res.status(400).json({ error: 'Product SKU and Name are required.' });
    }

    const openingStock = Math.max(0, num(b.currentStock));
    const purchasePrice = Math.max(0, num(b.purchasePrice));
    const sellingPrice = Math.max(0, num(b.sellingPrice));
    const wholesalePrice = Math.max(0, num(b.wholesalePrice || b.sellingPrice));

    const created = await db.transaction(async (tx) => {
      const [prod] = await tx
        .insert(products)
        .values({
          sku: String(b.sku).trim().toUpperCase(),
          barcode: String(b.barcode || '').trim(),
          name: String(b.name).trim(),
          burmeseName: String(b.burmeseName || b.name).trim(),
          brand: String(b.brand || '').trim(),
          model: String(b.model || '').trim(),
          categoryId: b.categoryId || null,
          description: String(b.description || ''),
          specifications: String(b.specifications || ''),
          unit: String(b.unit || 'PCS'),
          purchasePrice: toMoney(purchasePrice),
          weightedAvgCost: toMoney(purchasePrice),
          sellingPrice: toMoney(sellingPrice),
          wholesalePrice: toMoney(wholesalePrice),
          minStockLevel: Number(b.minStockLevel ?? 5),
          currentStock: toMoney(openingStock),
          warrantyMonths: Number(b.warrantyMonths ?? 12),
          trackSerial: Boolean(b.trackSerial),
          imageUrl: String(b.imageUrl || ''),
          isActive: b.isActive !== false,
        })
        .returning();

      if (openingStock > 0) {
        await tx.insert(stockMovements).values({
          productId: prod.id,
          quantity: toMoney(openingStock),
          movementType: 'opening',
          referenceType: 'opening',
          referenceNumber: `OPEN-${prod.sku}`,
          previousQty: '0.00',
          newQty: toMoney(openingStock),
          unitCost: toMoney(purchasePrice),
          reason: 'Opening stock on product creation',
          userId: req.appUser?.id,
        });
      }

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'CREATE_PRODUCT',
        module: 'inventory',
        recordId: prod.id,
        newValue: { sku: prod.sku, name: prod.name, sellingPrice, purchasePrice, openingStock },
        reason: 'Created product',
      });

      return prod;
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create product failed:', error);
    res.status(400).json({ error: error.message || 'Failed to create product. Ensure SKU is unique.' });
  }
});

// Edit Product (Never silently changes stock! Logs price changes in audit_logs)
inventoryRouter.put('/products/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const b = req.body;

    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
      if (!existing) throw new Error('Product not found.');

      const nextPurchase = b.purchasePrice !== undefined ? num(b.purchasePrice) : num(existing.purchasePrice);
      const nextSelling = b.sellingPrice !== undefined ? num(b.sellingPrice) : num(existing.sellingPrice);
      const nextWholesale = b.wholesalePrice !== undefined ? num(b.wholesalePrice) : num(existing.wholesalePrice);

      const [row] = await tx
        .update(products)
        .set({
          sku: b.sku ? String(b.sku).trim().toUpperCase() : existing.sku,
          barcode: b.barcode !== undefined ? String(b.barcode).trim() : existing.barcode,
          name: b.name ? String(b.name).trim() : existing.name,
          burmeseName: b.burmeseName !== undefined ? String(b.burmeseName).trim() : existing.burmeseName,
          brand: b.brand !== undefined ? String(b.brand).trim() : existing.brand,
          model: b.model !== undefined ? String(b.model).trim() : existing.model,
          categoryId: b.categoryId !== undefined ? b.categoryId || null : existing.categoryId,
          description: b.description !== undefined ? String(b.description) : existing.description,
          specifications: b.specifications !== undefined ? String(b.specifications) : existing.specifications,
          unit: b.unit || existing.unit,
          purchasePrice: toMoney(nextPurchase),
          sellingPrice: toMoney(nextSelling),
          wholesalePrice: toMoney(nextWholesale),
          minStockLevel: b.minStockLevel !== undefined ? Number(b.minStockLevel) : existing.minStockLevel,
          warrantyMonths: b.warrantyMonths !== undefined ? Number(b.warrantyMonths) : existing.warrantyMonths,
          trackSerial: b.trackSerial !== undefined ? Boolean(b.trackSerial) : existing.trackSerial,
          imageUrl: b.imageUrl !== undefined ? String(b.imageUrl) : existing.imageUrl,
          isActive: b.isActive !== undefined ? Boolean(b.isActive) : existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      const priceChanged =
        num(existing.sellingPrice) !== nextSelling ||
        num(existing.purchasePrice) !== nextPurchase ||
        num(existing.wholesalePrice) !== nextWholesale;

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: priceChanged ? 'UPDATE_PRODUCT_PRICE' : 'UPDATE_PRODUCT',
        module: 'inventory',
        recordId: id,
        previousValue: {
          purchasePrice: existing.purchasePrice,
          sellingPrice: existing.sellingPrice,
          wholesalePrice: existing.wholesalePrice,
        },
        newValue: {
          purchasePrice: row.purchasePrice,
          sellingPrice: row.sellingPrice,
          wholesalePrice: row.wholesalePrice,
        },
        reason: b.reason || (priceChanged ? 'Product pricing updated' : 'Product metadata updated'),
      });

      return row;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update product.' });
  }
});

// Archive Product (Soft delete to preserve transactional history)
inventoryRouter.delete('/products/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    const [archived] = await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    await writeAuditLog(db, {
      userId: req.appUser?.id,
      userEmail: req.appUser?.email,
      action: 'ARCHIVE_PRODUCT',
      module: 'inventory',
      recordId: id,
      previousValue: { isActive: true, sku: existing.sku },
      newValue: { isActive: false },
      reason: 'Archived product from active catalog',
    });

    res.json(archived);
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive product.' });
  }
});

// Controlled Stock Adjustment (Mandatory reason + Audit log + Negative stock check)
inventoryRouter.post('/products/adjust', async (req: AuthRequest, res) => {
  try {
    const { productId, adjustmentType, quantity, reason } = req.body;
    const qty = num(quantity);
    if (!productId || qty <= 0) {
      return res.status(400).json({ error: 'Product and positive adjustment quantity are required.' });
    }
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ error: 'A clear adjustment reason is mandatory for audit compliance.' });
    }

    const result = await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(businessSettings).limit(1);
      const [prod] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!prod) throw new Error('Product not found.');

      const prevQty = num(prod.currentStock);
      const isIncrease = adjustmentType === 'found' || adjustmentType === 'adjustment_in' || adjustmentType === 'stock_in';
      const delta = isIncrease ? qty : -qty;
      const newQty = prevQty + delta;

      if (newQty < 0 && !settings?.allowNegativeStock) {
        throw new Error(
          `Adjustment rejected: resulting stock (${newQty}) cannot be negative. Current stock is ${prevQty}.`
        );
      }

      const [updatedProd] = await tx
        .update(products)
        .set({ currentStock: toMoney(newQty), updatedAt: new Date() })
        .where(eq(products.id, productId))
        .returning();

      const movementType =
        adjustmentType === 'damaged'
          ? 'damaged'
          : isIncrease
            ? 'adjustment_in'
            : 'adjustment_out';

      const refNum = generateRefNumber('ADJ');
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          productId,
          quantity: toMoney(delta),
          movementType,
          referenceType: 'adjustment',
          referenceNumber: refNum,
          previousQty: toMoney(prevQty),
          newQty: toMoney(newQty),
          unitCost: prod.weightedAvgCost,
          reason: String(reason).trim(),
          userId: req.appUser?.id,
        })
        .returning();

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'STOCK_ADJUSTMENT',
        module: 'inventory',
        recordId: productId,
        previousValue: { sku: prod.sku, stock: prevQty },
        newValue: { sku: prod.sku, stock: newQty, delta, movementType, refNum },
        reason: String(reason).trim(),
      });

      return { product: updatedProd, movement };
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Stock adjustment failed.' });
  }
});

// Bulk CSV/Excel Import
inventoryRouter.post('/products/import', async (req: AuthRequest, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'No product rows provided for import.' });
    }

    const catRows = await db.select().from(categories);
    const catByName = new Map(catRows.map((c) => [c.name.toLowerCase(), c.id]));

    let importedCount = 0;
    const errors: string[] = [];

    await db.transaction(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const row = items[i];
        if (!row.sku || !row.name) {
          errors.push(`Row ${i + 1}: SKU and Name required`);
          continue;
        }
        const sku = String(row.sku).trim().toUpperCase();
        const existing = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
        if (existing.length > 0) {
          errors.push(`Row ${i + 1}: SKU ${sku} already exists (skipped)`);
          continue;
        }
        const cost = Math.max(0, num(row.purchasePrice));
        const sell = Math.max(0, num(row.sellingPrice));
        const wholesale = Math.max(0, num(row.wholesalePrice || sell));
        const stock = Math.max(0, num(row.currentStock));
        const catId = row.category
          ? catByName.get(String(row.category).trim().toLowerCase()) || null
          : null;

        const [created] = await tx
          .insert(products)
          .values({
            sku,
            barcode: String(row.barcode || ''),
            name: String(row.name).trim(),
            burmeseName: String(row.burmeseName || row.name).trim(),
            brand: String(row.brand || ''),
            model: String(row.model || ''),
            categoryId: catId,
            unit: String(row.unit || 'PCS'),
            purchasePrice: toMoney(cost),
            weightedAvgCost: toMoney(cost),
            sellingPrice: toMoney(sell),
            wholesalePrice: toMoney(wholesale),
            minStockLevel: Number(row.minStockLevel || 5),
            currentStock: toMoney(stock),
            warrantyMonths: Number(row.warrantyMonths || 12),
          })
          .returning();

        if (stock > 0) {
          await tx.insert(stockMovements).values({
            productId: created.id,
            quantity: toMoney(stock),
            movementType: 'opening',
            referenceType: 'opening',
            referenceNumber: `IMP-${sku}`,
            previousQty: '0.00',
            newQty: toMoney(stock),
            unitCost: toMoney(cost),
            reason: 'Imported opening stock via CSV',
            userId: req.appUser?.id,
          });
        }
        importedCount++;
      }

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'IMPORT_PRODUCTS_CSV',
        module: 'inventory',
        newValue: { importedCount, skipped: errors.length },
        reason: 'Bulk product import',
      });
    });

    res.json({ importedCount, errors });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Bulk product import failed.' });
  }
});

// Stock Movement History
inventoryRouter.get('/stock-movements', async (req, res) => {
  try {
    const productId = req.query.productId ? String(req.query.productId) : null;
    const [moves, prodRows, userRows] = await Promise.all([
      productId
        ? db
            .select()
            .from(stockMovements)
            .where(eq(stockMovements.productId, productId))
            .orderBy(desc(stockMovements.createdAt))
            .limit(300)
        : db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(300),
      db.select().from(products),
      db.select().from(users),
    ]);

    const prodMap = new Map(prodRows.map((p) => [p.id, p]));
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const enriched = moves.map((m) => ({
      ...m,
      productName: prodMap.get(m.productId)?.name || 'Unknown Product',
      productSku: prodMap.get(m.productId)?.sku || '',
      unit: prodMap.get(m.productId)?.unit || 'PCS',
      userName: m.userId ? userMap.get(m.userId)?.fullName || userMap.get(m.userId)?.email || '' : 'System',
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load stock movement history.' });
  }
});
