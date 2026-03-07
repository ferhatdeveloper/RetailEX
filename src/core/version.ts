/**
 * ExRetailOS Version Management
 * Auto-incremented version system
 */

export const APP_VERSION = {
  major: 0,
  minor: 1,
  build: 12,

  // Format: "Version 322"
  get display(): string {
    return `Version ${this.build}`;
  },

  // Format: "1.3.322"
  get full(): string {
    return `${this.major}.${this.minor}.${this.build}`;
  },

  // Increment build number
  increment(): void {
    this.build++;
    console.log(`🔄 Version updated to ${this.display}`);
  }
};

// Log current version on load
console.log(`🚀 ExRetailOS ${APP_VERSION.display} (${APP_VERSION.full})`);


