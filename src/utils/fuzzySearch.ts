/**
 * Fuzzy Search Utility
 * Provides typo-tolerant search with Levenshtein distance algorithm
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits required to change one string into another
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a 2D array for dynamic programming
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;
  
  // Fill the dp table
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  
  return dp[len1][len2];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 * 1 = identical, 0 = completely different
 */
export function similarityRatio(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLen;
}

/**
 * Check if query matches text with fuzzy matching
 * @param text - Text to search in
 * @param query - Search query
 * @param threshold - Minimum similarity (0-1), default 0.6
 * @returns true if match found
 */
export function fuzzyMatch(text: string, query: string, threshold: number = 0.6): boolean {
  if (!query || !text) return false;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Exact substring match - highest priority
  if (textLower.includes(queryLower)) return true;
  
  // Word-by-word fuzzy matching
  const textWords = textLower.split(/\s+/);
  const queryWords = queryLower.split(/\s+/);
  
  for (const queryWord of queryWords) {
    let bestMatch = 0;
    
    for (const textWord of textWords) {
      const ratio = similarityRatio(textWord, queryWord);
      if (ratio > bestMatch) bestMatch = ratio;
    }
    
    if (bestMatch < threshold) return false;
  }
  
  return true;
}

/**
 * Score a text against a query for ranking
 * Higher score = better match
 */
export function fuzzyScore(text: string, query: string): number {
  if (!query || !text) return 0;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let score = 0;
  
  // Exact match - highest score
  if (textLower === queryLower) return 100;
  
  // Starts with query - very high score
  if (textLower.startsWith(queryLower)) return 90;
  
  // Contains exact query - high score
  if (textLower.includes(queryLower)) return 80;
  
  // Fuzzy word matching
  const textWords = textLower.split(/\s+/);
  const queryWords = queryLower.split(/\s+/);
  
  for (const queryWord of queryWords) {
    for (const textWord of textWords) {
      const ratio = similarityRatio(textWord, queryWord);
      score += ratio * 60; // Max 60 points per word match
    }
  }
  
  return Math.min(score, 100);
}

/**
 * Fuzzy search through a list of items
 * @param items - Array of items to search
 * @param query - Search query
 * @param getTextFn - Function to extract searchable text from item
 * @param threshold - Minimum similarity (0-1), default 0.5
 * @returns Sorted array of matching items (best matches first)
 */
export function fuzzySearch<T>(
  items: T[],
  query: string,
  getTextFn: (item: T) => string | string[],
  threshold: number = 0.5
): T[] {
  if (!query) return items;
  
  const scored = items
    .map(item => {
      const texts = getTextFn(item);
      const textArray = Array.isArray(texts) ? texts : [texts];
      
      let maxScore = 0;
      for (const text of textArray) {
        const score = fuzzyScore(text, query);
        if (score > maxScore) maxScore = score;
      }
      
      return { item, score: maxScore };
    })
    .filter(({ score }) => score >= threshold * 100)
    .sort((a, b) => b.score - a.score);
  
  return scored.map(({ item }) => item);
}

/**
 * Highlight matching parts in text
 * Returns HTML string with <mark> tags around matches
 */
export function highlightMatches(text: string, query: string): string {
  if (!query || !text) return text;
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Find exact match positions
  const index = textLower.indexOf(queryLower);
  
  if (index !== -1) {
    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);
    return `${before}<mark class="bg-yellow-200 dark:bg-yellow-700">${match}</mark>${after}`;
  }
  
  return text;
}


