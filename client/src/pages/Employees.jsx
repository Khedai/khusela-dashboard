import { useState, useEffect } from 'react';
import api from '../utils/api';

const EMPTY_FORM = {
    title: '', first_name: '', last_name: '', id_number: '', tax_number: '',
    birth_date: '', marital_status: '', email: '', home_phone: '', alternate_phone: '',
    address_street: '', address_city: '', postal_code: '',
    allergies_health_concerns: '',
    ec_title: '', ec_first_name: '', ec_last_name: '', ec_address: '',
    ec_primary_phone: '', ec_alternate_phone: '', ec_relationship: '',
    bank_name: '', branch_name: '', branch_code: '', account_name: '', account_number: ''
};

export default function Employees() {
    const [employees, setEmployees] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        try {
            const res = await api.get('/employees');
            setEmployees(res.data);
        } catch (err) {
            setError('Failed to load employees.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            await api.post('/employees', form);
            setSuccess('Employee onboarded successfully.');
            setShowForm(false);
            setForm(EMPTY_FORM);
            fetchEmployees();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save employee.');
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = employees.filter(e =>
        `${e.first_name} ${e.last_name} ${e.id_number} ${e.email}`
            .toLowerCase().includes(search.toLowerCase())
    );

    // ── Detail Modal ──────────────────────────────────────────
    if (selectedEmployee) {
        const e = selectedEmployee;
        return (
            <div>
                <button
                    onClick={() => setSelectedEmployee(null)}
                    className="mb-4 text-sm text-blue-600 hover:underline"
                >
                    ← Back to Directory
                </button>
                <div className="bg-white rounded-xl shadow p-6 max-w-3xl">
                    <h2 className="text-xl font-bold text-gray-800 mb-6">
                        {e.title} {e.first_name} {e.last_name}
                    </h2>

                    <Section title="Personal Information">
                        <Row label="ID Number" value={e.id_number} />
                        <Row label="Tax Number" value={e.tax_number} />
                        <Row label="Date of Birth" value={e.birth_date?.split('T')[0]} />
                        <Row label="Marital Status" value={e.marital_status} />
                        <Row label="Email" value={e.email} />
                        <Row label="Home Phone" value={e.home_phone} />
                        <Row label="Alternate Phone" value={e.alternate_phone} />
                    </Section>

                    <Section title="Address">
                        <Row label="Street" value={e.address_street} />
                        <Row label="City" value={e.address_city} />
                        <Row label="Postal Code" value={e.postal_code} />
                    </Section>

                    <Section title="Health">
                        <Row label="Allergies / Concerns" value={e.allergies_health_concerns} />
                    </Section>

                    <Section title="Emergency Contact">
                        <Row label="Name" value={`${e.ec_title || ''} ${e.ec_first_name || ''} ${e.ec_last_name || ''}`.trim()} />
                        <Row label="Relationship" value={e.ec_relationship} />
                        <Row label="Primary Phone" value={e.ec_primary_phone} />
                        <Row label="Alternate Phone" value={e.ec_alternate_phone} />
                        <Row label="Address" value={e.ec_address} />
                    </Section>

                    <Section title="Bank Details">
                        <Row label="Bank" value={e.bank_name} />
                        <Row label="Branch" value={e.branch_name} />
                        <Row label="Branch Code" value={e.branch_code} />
                        <Row label="Account Name" value={e.account_name} />
                        <Row label="Account Number" value={e.account_number} />
                    </Section>
                </div>
            </div>
        );
    }

    // ── Onboarding Form ───────────────────────────────────────
    if (showForm) {
        return (
            <div>
                <button
                    onClick={() => { setShowForm(false); setError(''); }}
                    className="mb-4 text-sm text-blue-600 hover:underline"
                >
                    ← Back to Directory
                </button>
                <div className="bg-white rounded-xl shadow p-6 max-w-3xl">
                    <h2 className="text-xl font-bold text-gray-800 mb-6">Onboard New Employee</h2>

                    {error && <Alert type="error" message={error} />}
                    {success && <Alert type="success" message={success} />}

                    <form onSubmit={handleSubmit} className="space-y-8">

                        <FormSection title="Personal Information">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Title" name="title" value={form.title} onChange={handleChange}
                                    type="select" options={['', 'Mr', 'Mrs', 'Ms', 'Dr', 'Prof']} />
                                <Field label="First Name *" name="first_name" value={form.first_name} onChange={handleChange} required />
                                <Field label="Last Name *" name="last_name" value={form.last_name} onChange={handleChange} required />
                                <Field label="ID Number" name="id_number" value={form.id_number} onChange={handleChange} />
                                <Field label="Tax Number" name="tax_number" value={form.tax_number} onChange={handleChange} />
                                <Field label="Date of Birth" name="birth_date" value={form.birth_date} onChange={handleChange} type="date" />
                                <Field label="Marital Status" name="marital_status" value={form.marital_status} onChange={handleChange}
                                    type="select" options={['', 'Single', 'Married', 'Divorced', 'Widowed']} />
                                <Field label="Email" name="email" value={form.email} onChange={handleChange} type="email" />
                                <Field label="Home Phone" name="home_phone" value={form.home_phone} onChange={handleChange} />
                                <Field label="Alternate Phone" name="alternate_phone" value={form.alternate_phone} onChange={handleChange} />
                            </div>
                        </FormSection>

                        <FormSection title="Address">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Field label="Street Address" name="address_street" value={form.address_street} onChange={handleChange} />
                                </div>
                                <Field label="City" name="address_city" value={form.address_city} onChange={handleChange} />
                                <Field label="Postal Code" name="postal_code" value={form.postal_code} onChange={handleChange} />
                            </div>
                        </FormSection>

                        <FormSection title="Health">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Allergies / Health Concerns</label>
                                <textarea
                                    name="allergies_health_concerns"
                                    value={form.allergies_health_concerns}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </FormSection>

                        <FormSection title="Emergency Contact">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Title" name="ec_title" value={form.ec_title} onChange={handleChange}
                                    type="select" options={['', 'Mr', 'Mrs', 'Ms', 'Dr']} />
                                <Field label="First Name" name="ec_first_name" value={form.ec_first_name} onChange={handleChange} />
                                <Field label="Last Name" name="ec_last_name" value={form.ec_last_name} onChange={handleChange} />
                                <Field label="Relationship" name="ec_relationship" value={form.ec_relationship} onChange={handleChange} />
                                <Field label="Primary Phone" name="ec_primary_phone" value={form.ec_primary_phone} onChange={handleChange} />
                                <Field label="Alternate Phone" name="ec_alternate_phone" value={form.ec_alternate_phone} onChange={handleChange} />
                                <div className="col-span-2">
                                    <Field label="Address" name="ec_address" value={form.ec_address} onChange={handleChange} />
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Bank Details">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Bank Name" name="bank_name" value={form.bank_name} onChange={handleChange} />
                                <Field label="Branch Name" name="branch_name" value={form.branch_name} onChange={handleChange} />
                                <Field label="Branch Code" name="branch_code" value={form.branch_code} onChange={handleChange} />
                                <Field label="Account Name" name="account_name" value={form.account_name} onChange={handleChange} />
                                <Field label="Account Number" name="account_number" value={form.account_number} onChange={handleChange} />
                            </div>
                        </FormSection>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {submitting ? 'Saving...' : 'Save Employee'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowForm(false); setError(''); }}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-6 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // ── Directory Table ───────────────────────────────────────
    return (
        <div>
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-3">Employee Directory</h2>
                <button
                    onClick={() => { setShowForm(true); setSuccess(''); setError(''); }}
                    className="text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    style={{ backgroundColor: '#2563eb' }}
                    >
                    + Onboard New Employee
                </button>
            </div>

            {success && <Alert type="success" message={success} />}
            {error && <Alert type="error" message={error} />}

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search by name, ID number or email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                {loading ? (
                    <p className="p-6 text-gray-500 text-sm">Loading employees...</p>
                ) : filtered.length === 0 ? (
                    <p className="p-6 text-gray-500 text-sm">No employees found.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 text-left">Name</th>
                                <th className="px-4 py-3 text-left">ID Number</th>
                                <th className="px-4 py-3 text-left">Email</th>
                                <th className="px-4 py-3 text-left">Phone</th>
                                <th className="px-4 py-3 text-left">Marital Status</th>
                                <th className="px-4 py-3 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map(emp => (
                                <tr key={emp.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-800">
                                        {emp.title} {emp.first_name} {emp.last_name}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{emp.id_number || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{emp.email || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{emp.home_phone || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{emp.marital_status || '—'}</td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => setSelectedEmployee(emp)}
                                            className="text-blue-600 hover:underline text-xs font-medium"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ── Helper Components ─────────────────────────────────────

function Section({ title, children }) {
    return (
        <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 pb-1 border-b">
                {title}
            </h3>
            <div className="grid grid-cols-2 gap-2">
                {children}
            </div>
        </div>
    );
}

function Row({ label, value }) {
    return (
        <>
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm text-gray-800">{value || '—'}</span>
        </>
    );
}

function FormSection({ title, children }) {
    return (
        <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 pb-1 border-b">
                {title}
            </h3>
            {children}
        </div>
    );
}

function Field({ label, name, value, onChange, type = 'text', options, required }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            {type === 'select' ? (
                <select
                    name={name}
                    value={value}
                    onChange={onChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {options.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
                </select>
            ) : (
                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    required={required}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            )}
        </div>
    );
}

function Alert({ type, message }) {
    const styles = type === 'error'
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-green-50 border-green-200 text-green-700';
    return (
        <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${styles}`}>
            {message}
        </div>
    );
}