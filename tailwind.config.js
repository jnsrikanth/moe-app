/****
 * TailwindCSS config for the Python dashboard (OFFLINE build).
 *
 * Build once on your Mac, then commit the generated file:
 *   tailwindcss -i web/static/css/tw.css -o web/static/css/tailwind.dist.css --minify
 * (Use the Tailwind standalone binary or npx; CloudPC will not run any build.)
 */
module.exports = {
  content: [
    "./web/templates/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#2563eb', // blue-600
          deep: '#1e40af',    // blue-800
          amber: '#fbbf24',   // amber-400
        },
      },
    },
  },
  plugins: [],
};