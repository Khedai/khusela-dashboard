/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'bg-blue-600',
    'bg-blue-700',
    'bg-green-500',
    'bg-red-500',
    'bg-gray-100',
    'bg-gray-200',
    'bg-gray-700',
    'bg-purple-100',
    'bg-yellow-100',
    'bg-green-100',
    'bg-red-100',
    'bg-blue-100',
    'text-purple-700',
    'text-yellow-700',
    'text-green-700',
    'text-red-700',
    'text-blue-700',
    'text-gray-600',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}