import { StringUtilities } from './string-utilities';

export class UriUtilities {
    static BuildDetectorLink(resourceUri: string, detectorId: string): string {
        return 'https://portal.azure.com' +
            `/?websitesextension_ext=asd.featurePath%3Ddetectors%2F${detectorId}#@microsoft.onmicrosoft.com` +
            `/resource/${StringUtilities.TrimBoth(resourceUri, '/')}/troubleshoot`
    }

    static buildSlotLink(resourceUri: string, isTargetingPreview: boolean): string {
        return `https://portal.azure.com/?websitesextension_ext=asd.ispreview%3D${isTargetingPreview}#@microsoft.onmicrosoft.com/resource/${StringUtilities.TrimBoth(resourceUri, '/')}/troubleshoot`;
    }
}
