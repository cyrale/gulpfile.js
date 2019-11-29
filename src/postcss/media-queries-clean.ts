import postcss, { ChildNode, ContainerBase } from "postcss";

/**
 * Extract critical rules.
 */
export default postcss.plugin("media-queries-clean", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    css.walkAtRules("media", (node: ChildNode): void => {
      node.remove();
    });
  };
});
