import { BrowserWindow, session } from 'electron';
import { HttpsProxyAgent } from 'https-proxy-agent';

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

import downloadChromeExtension from './downloadChromeExtension';
import { getPath } from './utils';

let IDMap: Record<string, string> = {};
const getIDMapPath = () => path.resolve(getPath(), 'IDMap.json');
if (fs.existsSync(getIDMapPath())) {
  try {
    IDMap = JSON.parse(fs.readFileSync(getIDMapPath(), 'utf8'));
  } catch (err) {
    console.error('electron-devtools-installer: Invalid JSON present in the IDMap file');
  }
}

interface ExtensionReference {
  /**
   * Extension ID
   */
  id: string;
  /**
   * Range of electron versions this extension is supported by
   */
  electron: string;
  /**
   * Working version
   */
  version?: string;
}

interface ExtensionOptions {
  /**
   * Ignore whether the extension is already downloaded and redownload every time
   */
  forceDownload?: boolean;
  /**
   * Options passed to session.loadExtension
   */
  loadExtensionOptions?: Record<any, any>;
  /**
   * Optional proxy configuration, which can be a boolean indicating usage or an array
   * of parameters for constructing an HttpsProxyAgent.When the parameter is 'true', it
   * will try to automatically configure the local proxy.
   */
  proxy?: boolean | ConstructorParameters<typeof HttpsProxyAgent>;
}

/**
 * @param extensionReference Extension or extensions to install
 * @param options Installation options
 * @returns A promise resolving with the name or names of the extensions installed
 */
const install = (
  extensionReference: ExtensionReference | string | Array<ExtensionReference | string>,
  options: ExtensionOptions | boolean = {},
): Promise<string> => {
  // Support old forceDownload syntax
  if (typeof options === 'boolean') {
    options = { forceDownload: options };
  }
  const { forceDownload, loadExtensionOptions, proxy } = options;

  if (process.type !== 'browser') {
    return Promise.reject(
      new Error('electron-devtools-installer can only be used from the main process'),
    );
  }

  if (Array.isArray(extensionReference)) {
    return extensionReference.reduce(
      (accum, extension) => accum.then(() => install(extension, options)),
      Promise.resolve(''),
    );
  }
  let chromeStoreID: string;
  if (typeof extensionReference === 'object' && extensionReference.id) {
    chromeStoreID = extensionReference.id;
    const electronVersion = process.versions.electron.split('-')[0];
    if (!semver.satisfies(electronVersion, extensionReference.electron)) {
      return Promise.reject(
        new Error(
          `Version of Electron: ${electronVersion} does not match required range ${extensionReference.electron} for extension ${chromeStoreID}`,
        ), // eslint-disable-line
      );
    }
  } else if (typeof extensionReference === 'string') {
    chromeStoreID = extensionReference;
  } else {
    return Promise.reject(
      new Error(`Invalid extensionReference passed in: "${extensionReference}"`),
    );
  }
  const extensionName = IDMap[chromeStoreID];
  let extensionInstalled: boolean;
  let agent: HttpsProxyAgent<string> | undefined;

  // For Electron >=9.
  if ((session.defaultSession as any).getExtension) {
    extensionInstalled =
      !!extensionName &&
      (session.defaultSession as any)
        .getAllExtensions()
        .find((e: { name: string }) => e.name === extensionName);

    if (proxy && typeof proxy === 'object') {
      agent = new HttpsProxyAgent(...proxy);
    } else if (proxy === true) {
      session.defaultSession.resolveProxy('https://clients2.google.com').then((proxy) => {
        if (proxy !== 'DIRECT') {
          const hostAndPort = proxy.split(' ')[1];
          const [proxyHost, proxyPort] = hostAndPort.split(':');

          agent = new HttpsProxyAgent(`http://${proxyHost}:${proxyPort}`);
        } else {
          return Promise.reject(
            new Error(
              'You set the proxy parameter to true, but the local http proxy is not detected, so the proxy is skipped. Please try to configure the proxy manually.',
            ),
          );
        }
      });
    } else {
      agent = undefined;
    }
  } else {
    extensionInstalled =
      !!extensionName &&
      BrowserWindow.getDevToolsExtensions &&
      BrowserWindow.getDevToolsExtensions().hasOwnProperty(extensionName);
  }

  if (!forceDownload && extensionInstalled) {
    return Promise.resolve(IDMap[chromeStoreID]);
  }
  return downloadChromeExtension(chromeStoreID, forceDownload || false, agent).then(
    (extensionFolder) => {
      // Use forceDownload, but already installed
      if (extensionInstalled) {
        // For Electron >=9.
        if ((session.defaultSession as any).removeExtension) {
          const extensionId = (session.defaultSession as any)
            .getAllExtensions()
            .find((e: { name: string }) => e.name).id;
          (session.defaultSession as any).removeExtension(extensionId);
        } else {
          BrowserWindow.removeDevToolsExtension(extensionName);
        }
      }

      // For Electron >=9.
      if ((session.defaultSession as any).loadExtension) {
        return (session.defaultSession as any)
          .loadExtension(extensionFolder, loadExtensionOptions)
          .then((ext: { name: string }) => {
            return Promise.resolve(ext.name);
          });
      }

      const name = BrowserWindow.addDevToolsExtension(extensionFolder); // eslint-disable-line

      fs.writeFileSync(
        getIDMapPath(),
        JSON.stringify(
          Object.assign(IDMap, {
            [chromeStoreID]: name,
          }),
        ),
      );
      return Promise.resolve(name);
    },
  );
};

export default install;
export const EMBER_INSPECTOR: ExtensionReference = {
  id: 'bmdblncegkenkacieihfhpjfppoconhi',
  electron: '>=1.2.1',
  version: '4.9.1',
};
export const REACT_DEVELOPER_TOOLS: ExtensionReference = {
  id: 'fmkadmapgofadopljbjfkapdkoienihi',
  electron: '>=1.2.1',
  version: '4.24.7',
};
export const BACKBONE_DEBUGGER: ExtensionReference = {
  id: 'bhljhndlimiafopmmhjlgfpnnchjjbhd',
  electron: '>=1.2.1',
  version: '0.4.1',
};
export const JQUERY_DEBUGGER: ExtensionReference = {
  id: 'dbhhnnnpaeobfddmlalhnehgclcmjimi',
  electron: '>=1.2.1',
  version: '0.1.3.2',
};
export const ANGULAR_DEVTOOLS: ExtensionReference = {
  id: 'ienfalfjdbdpebioblfackkekamfmbnh',
  electron: '>=1.2.1',
  version: '1.0.7',
};
export const VUEJS_DEVTOOLS: ExtensionReference = {
  id: 'nhdogjmejiglipccpnnnanhbledajbpd',
  electron: '>=1.2.1',
  version: '6.5.0',
};
export const REDUX_DEVTOOLS: ExtensionReference = {
  id: 'lmhkpmbekcpmknklioeibfkpmmfibljd',
  electron: '>=1.2.1',
  version: '3.0.19',
};
export const APOLLO_DEVELOPER_TOOLS: ExtensionReference = {
  id: 'jdkknkkbebbapilgoeccciglkfbmbnfm',
  electron: '>=1.2.1',
  version: '4.1.4',
};
export const MOBX_DEVTOOLS: ExtensionReference = {
  id: 'pfgnfdagidkfgccljigdamigbcnndkod',
  electron: '>=1.2.1',
  version: '0.9.26',
};
