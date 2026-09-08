/**
 * SolWash Random Avatar Generator
 * Generates stylish, colorful random avatars for customers
 */

const AVATAR_COLLECTIONS = [
  'bottts',      // Cool solar robots
  'avataaars',   // Friendly illustrated people
  'lorelei',     // Modern clean portraits
  'micah',       // Stylized artistic portraits
  'thumbs',      // Friendly expressive faces
  'personas'     // Modern flat characters
];

const BACKGROUND_COLORS = [
  'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf',
  'd1fae5', 'fef08a', 'fed7aa', 'e0e7ff', 'fce7f3'
];

/**
 * Generate a random avatar URL for a given identifier (name, email, or random)
 * @param {string} seed
 * @returns {string} avatarUrl
 */
function generateRandomAvatar(seed) {
  const safeSeed = seed
    ? encodeURIComponent(String(seed).trim().toLowerCase())
    : `sol_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const randomCollection = AVATAR_COLLECTIONS[Math.floor(Math.random() * AVATAR_COLLECTIONS.length)];
  const randomBg = BACKGROUND_COLORS[Math.floor(Math.random() * BACKGROUND_COLORS.length)];

  return `https://api.dicebear.com/7.x/${randomCollection}/svg?seed=${safeSeed}&backgroundColor=${randomBg}`;
}

module.exports = {
  generateRandomAvatar,
  AVATAR_COLLECTIONS
};
