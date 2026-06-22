// Single source of truth for what each role can do
export const can = (user, action) => {
  const role = user?.role;
  const rules = {
    // Applications
    'applications.view':         ['Admin', 'HR', 'Consultant'],
    'applications.create':       ['Admin', 'HR', 'Consultant'],
    'applications.changeStatus': ['Admin', 'HR'],
    'applications.delete':       ['Admin'],
    'applications.viewAll':      ['Admin'], // toggle to see all franchises
    
    // Employees
    'employees.view':            ['Admin', 'HR', 'Consultant'],
    'employees.create':          ['Admin'],
    'employees.edit':            ['Admin', 'HR'],
    'employees.delete':          ['Admin'],
    'employees.uploadDocs':      ['Admin', 'HR'],

    // Leave
    'leave.apply':               ['HR', 'Consultant'],
    'leave.approve':             ['Admin'],
    'leave.viewAll':             ['Admin'],

    // Messaging
    'messages.send':             ['Admin', 'HR', 'Consultant'],
    'messages.viewInbox':        ['Admin', 'HR', 'Consultant'],

    // Users
    'users.manage':              ['Admin'],

    // Franchises
    'franchises.view':           ['Admin'],
    'franchises.create':         ['Admin'],
    'franchises.edit':           ['Admin'],
    'franchises.delete':         ['Admin'],

    // Time Tracking
    'time.clockSelf':            ['HR', 'Consultant'],
    'time.viewAll':              ['Admin', 'HR'],
    'time.manageAttendance':     ['Admin', 'HR'],

    // Dashboard
    'dashboard.viewAll':         ['Admin'],
    'dashboard.employeeCount':   ['Admin', 'HR'],
  };

  return rules[action]?.includes(role) ?? false;
};