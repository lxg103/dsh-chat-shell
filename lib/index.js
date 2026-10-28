/** Host loader entry for dsh-chat-shell.
 *
 * The plugin is browser-only: the interface it paints is a client plugin, and
 * the browser surface it embeds is provided by the desktop shell. A host
 * package still has to exist, because the loader mounts the package on both
 * sides and expects an `apply` from each one.
 */
export function apply() {}
