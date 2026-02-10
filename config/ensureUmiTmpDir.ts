import fs from 'node:fs';
import path from 'node:path';

export default (api: any) => {
  const ensureTmpDir = () => {
    const tmpPath = api?.paths?.absTmpPath;
    if (!tmpPath) return;
    fs.mkdirSync(tmpPath, { recursive: true });
    const appDataPath = path.join(tmpPath, 'appData.json');
    if (!fs.existsSync(appDataPath)) {
      fs.writeFileSync(appDataPath, '{}', 'utf8');
    }
  };

  api.onStart(ensureTmpDir);
  api.register({
    key: 'onCheckPkgJSON',
    fn: ensureTmpDir,
  });
};
