/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0f172a",
        accent: "#0ea5a4",
        mutedbg: "#f8fafc",
      },
    },
  },
  plugins: [],
};

