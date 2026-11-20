import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Wallet, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK, getYangonTodayClient } from '../../lib/i18n';
import { DataTable, Modal, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

export const EmployeesAuditView: React.FC = () => {
  const { t, lang, bootstrap, refreshBootstrap, notify } = useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [tab, setTab] = useState<'employees' | 'users' | 'audit'>('employees');
  const [employees, setEmployees] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [empForm, setEmpForm] = useState({
    fullName: '',
    phone: '',
    position: 'Solar Technician',
    monthlySalary: '600000',
    joiningDate: getYangonTodayClient(),
    role: 'staff',
  });

  const [salaryEmp, setSalaryEmp] = useState<any | null>(null);
  const [salaryForm, setSalaryForm] = useState({
    amount: '',
    accountId: '',
    monthLabel: getYangonTodayClient().slice(0, 7),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empData, logs] = await Promise.all([
        apiRequest<{ employees: any[]; users: any[] }>('/api/employees'),
        apiRequest<any[]>('/api/audit-logs'),
      ]);
      setEmployees(empData.employees);
      setUsersList(empData.users);
      setAuditLogs(logs);
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/employees', { method: 'POST', body: empForm });
      notify('success', 'Employee added.');
      setAddOpen(false);
      setEmpForm({
        fullName: '',
        phone: '',
        position: 'Solar Technician',
        monthlySalary: '600000',
        joiningDate: getYangonTodayClient(),
        role: 'staff',
      });
      await loadData();
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handlePaySalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryEmp) return;
    try {
      await apiRequest(`/api/employees/${salaryEmp.id}/pay-salary`, {
        method: 'POST',
        body: {
          amount: Number(salaryForm.amount),
          accountId: salaryForm.accountId || bootstrap?.accounts?.[0]?.id,
          monthLabel: salaryForm.monthLabel,
        },
      });
      notify('success', `Salary paid to ${salaryEmp.fullName} and recorded in Expenses.`);
      setSalaryEmp(null);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const empCols: ColumnDef<any>[] = [
    {
      key: 'fullName',
      header: 'Employee',
      render: (r) => (
        <div>
          <div className="font-semibold text-[#14243A]">{r.fullName}</div>
          <div className="text-[11px] text-slate-500">
            {r.employeeCode} · {r.phone}
          </div>
        </div>
      ),
    },
    { key: 'position', header: 'Position', render: (r) => r.position },
    {
      key: 'monthlySalary',
      header: 'Monthly Salary',
      align: 'right',
      render: (r) => <span className="font-mono-num font-semibold">{formatMMK(r.monthlySalary, currency)}</span>,
    },
    {
      key: 'joiningDate',
      header: 'Joined',
      render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.joiningDate)}</span>,
    },
    { key: 'status', header: 'Status', render: (r) => <StatusText status={r.status} /> },
    {
      key: 'actions',
      header: 'Payroll',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setSalaryEmp(r);
            setSalaryForm({
              amount: String(Number(r.monthlySalary)),
              accountId: bootstrap?.accounts?.[0]?.id || '',
              monthLabel: getYangonTodayClient().slice(0, 7),
            });
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Pay Salary</span>
        </button>
      ),
    },
  ];

  const auditCols: ColumnDef<any>[] = [
    {
      key: 'createdAt',
      header: 'Date & Time',
      render: (r) => (
        <span className="font-mono-num text-xs text-slate-500">
          {new Date(r.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}
        </span>
      ),
    },
    { key: 'userEmail', header: 'User', render: (r) => <span className="text-xs font-medium">{r.userEmail}</span> },
    { key: 'module', header: 'Module', render: (r) => <span className="text-xs capitalize text-slate-600">{r.module}</span> },
    { key: 'action', header: 'Action', render: (r) => <span className="font-mono-num text-xs font-bold text-[#14243A]">{r.action}</span> },
    { key: 'reason', header: 'Reason / Details', render: (r) => <span className="text-xs text-slate-600">{r.reason || '—'}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_employees')}
        subtitle={
          lang === 'my'
            ? 'ဝန်ထမ်းစာရင်း၊ လစာပေးချေမှု၊ အသုံးပြုသူအခွင့်အရေးနှင့် စနစ်တစ်ခုလုံး၏ စာရင်းစစ်မှတ်တမ်း (Audit Log)'
            : 'Staff records, salary disbursement, user role permissions, and immutable system audit trail'
        }
        actions={
          <>
            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
              <button
                type="button"
                onClick={() => setTab('employees')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  tab === 'employees' ? 'bg-[#14243A] text-white' : 'text-slate-600'
                }`}
              >
                Employees ({employees.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('users')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  tab === 'users' ? 'bg-[#14243A] text-white' : 'text-slate-600'
                }`}
              >
                Users & Roles ({usersList.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('audit')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md ${
                  tab === 'audit' ? 'bg-[#14243A] text-white' : 'text-slate-600'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Audit Log ({auditLogs.length})</span>
              </button>
            </div>
            {tab === 'employees' && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg"
              >
                <Plus className="w-4 h-4" />
                <span>Add Employee</span>
              </button>
            )}
          </>
        }
      />

      {tab === 'employees' && (
        <DataTable
          data={employees}
          columns={empCols}
          loading={loading}
          searchPlaceholder="Search employee name, position..."
          searchFilter={(r, q) => r.fullName.toLowerCase().includes(q) || r.position.toLowerCase().includes(q)}
        />
      )}

      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">User Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role & Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersList.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-semibold text-[#14243A]">{u.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        try {
                          await apiRequest(`/api/users/${u.id}/role`, {
                            method: 'PATCH',
                            body: { role: e.target.value },
                          });
                          notify('success', `Updated role for ${u.email}.`);
                          await loadData();
                        } catch (err: any) {
                          notify('error', err.message);
                        }
                      }}
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="owner">Owner (Full Access + Reopen Closings)</option>
                      <option value="manager">Manager (Operations & Inventory)</option>
                      <option value="accountant">Accountant (Finance & Closings)</option>
                      <option value="cashier">Cashier (POS & Collections)</option>
                      <option value="staff">Staff (Read / Basic)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <DataTable
          data={auditLogs}
          columns={auditCols}
          loading={loading}
          searchPlaceholder="Search action, module, user email, reason..."
          searchFilter={(r, q) =>
            r.action.toLowerCase().includes(q) ||
            r.module.toLowerCase().includes(q) ||
            (r.userEmail || '').toLowerCase().includes(q) ||
            (r.reason || '').toLowerCase().includes(q)
          }
          pageSize={15}
        />
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Employee" size="md">
        <form onSubmit={handleAddEmployee} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              required
              value={empForm.fullName}
              onChange={(e) => setEmpForm({ ...empForm, fullName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                value={empForm.phone}
                onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Position *</label>
              <input
                required
                value={empForm.position}
                onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Salary ({currency})</label>
              <input
                type="number"
                value={empForm.monthlySalary}
                onChange={(e) => setEmpForm({ ...empForm, monthlySalary: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Joining Date</label>
              <input
                type="date"
                value={empForm.joiningDate}
                onChange={(e) => setEmpForm({ ...empForm, joiningDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Save Employee
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(salaryEmp)}
        onClose={() => setSalaryEmp(null)}
        title={`Disburse Salary — ${salaryEmp?.fullName || ''}`}
        subtitle="Automatically creates an Employee Salary expense and deducts from the selected account."
        size="md"
      >
        <form onSubmit={handlePaySalary} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Salary Month</label>
              <input
                type="month"
                value={salaryForm.monthLabel}
                onChange={(e) => setSalaryForm({ ...salaryForm, monthLabel: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency}) *</label>
              <input
                type="number"
                required
                min="1"
                value={salaryForm.amount}
                onChange={(e) => setSalaryForm({ ...salaryForm, amount: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Pay From Account</label>
            <select
              value={salaryForm.accountId}
              onChange={(e) => setSalaryForm({ ...salaryForm, accountId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {(bootstrap?.accounts || []).map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSalaryEmp(null)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg">
              Confirm Salary Payment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
