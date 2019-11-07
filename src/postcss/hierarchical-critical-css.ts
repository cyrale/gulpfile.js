import postcss, { ChildNode, ContainerBase, Declaration } from "postcss";

/**
 * Make critical properties hierarchical (PostCSS plugin).
 */
export default postcss.plugin("postcss-hierarchical-critical", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    css.walkDecls("critical", (decl: Declaration): void => {
      if (decl.parent.nodes) {
        decl.parent.nodes
          .filter((node: ChildNode): boolean => node.type === "rule" || node.type === "atrule")
          .forEach((node: ChildNode): void => {
            (node as ContainerBase).append({ prop: "critical", value: "this" });
          });
      }
    });
  };
});