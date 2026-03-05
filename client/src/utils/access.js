// Single source of truth for what each role can do
export const can = (user, action) => {
  const role = user?.role;
  const rules = {
    // Applications
    'applications.view':         ['Admin', 'HR', 'Consultant'],
    'applications.create':       ['Admin', 'HR', 'Consultant'],
    'applications.changeStatus': ['Admin', 'HR'],
    'applications.delete':       ['Admin'],
    'applications.viewAll':      ['Admin', 'HR'], // toggle to see all franchises
    
    // Employees
    'employees.view':            ['Admin', 'HR'],
    'employees.create':          ['Admin', 'HR'],
    'employees.edit':            ['Admin', 'HR'],
    'employees.delete':          ['Admin'],
    'employees.uploadDocs':      ['Admin', 'HR'],

    // Leave
    'leave.apply':               ['HR', 'Consultant'],
    'leave.approve':             ['Admin', 'HR'],
    'leave.viewAll':             ['Admin', 'HR'],

    // Messaging
    'messages.send':             ['Admin', 'HR'],
    'messages.viewInbox':        ['Admin', 'HR'],

    // Users
    'users.manage':              ['Admin'],

    // Franchises
    'franchises.view':           ['Admin', 'HR', 'Consultant'],
    'franchises.create':         ['Admin'],
    'franchises.edit':           ['Admin'],
    'franchises.delete':         ['Admin'],

    // Dashboard
    'dashboard.viewAll':         ['Admin', 'HR'],
    'dashboard.employeeCount':   ['Admin', 'HR'],
  };

  return rules[action]?.includes(role) ?? false;
};