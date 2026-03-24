const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Sanitizes input string to prevent XSS.
 * @param {string} input - Raw user input string.
 * @returns {string} Sanitized string.
 */
function sanitize(input) {
  if (typeof input !== 'string') return input;
  return purify.sanitize(input);
}

module.exports = { sanitize };
