/**
 * Xcode 15+/27: Pod resource targets often keep IPHONEOS_DEPLOYMENT_TARGET < 15.
 * Force all Pods (incl. resource bundles) to the same min as expo-build-properties.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# retailex-ios-min-deployment-target';

function withIosMinDeploymentTarget(config, props = {}) {
  const min = String(props.deploymentTarget || '16.4');
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let src = fs.readFileSync(podfile, 'utf8');
      if (src.includes(MARKER)) {
        return cfg;
      }
      const hook = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |build_config|
      build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${min}'
    end
  end
`;
      if (/post_install\s+do\s+\|installer\|/.test(src)) {
        src = src.replace(
          /post_install\s+do\s+\|installer\|/,
          (m) => `${m}\n${hook}`,
        );
      } else {
        src += `\npost_install do |installer|\n${hook}end\n`;
      }
      fs.writeFileSync(podfile, src);
      return cfg;
    },
  ]);
}

module.exports = withIosMinDeploymentTarget;
