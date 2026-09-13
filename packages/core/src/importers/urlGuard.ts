// Single import point for the URL helpers the importers and the CSV mapper need. (It used to
// carry an eslint-disable for firewall A, whose glob form matched the `url` directory segment;
// the firewall now uses a regex anchored on the bare specifier, so no disable is needed.)
export { InvalidUrlError, isProbablyUrl, normalizeUrl, registrableDomain } from '../url/normalize.js';
export type { NormalizeOptions, NormalizedUrl } from '../url/normalize.js';
