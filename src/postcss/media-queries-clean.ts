import postcss, { ChildNode, ContainerBase } from "postcss";

/**
 * Remove media queries.
 */
export default postcss.plugin("media-queries-clean", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    css.walkAtRules("media", (node: ChildNode): void => {
      node.remove();
    });
  };
});
