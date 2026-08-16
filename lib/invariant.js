//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-hive`.
* @module @deepseek-ai/dsh-hive/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-hive";
/** Cordis companion plugin name. */
const name = "dsh-hive-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/** No runtime invariant: the messenger adapter has no independent lifecycle stream. */
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
