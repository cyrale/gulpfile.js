import postcss, { ChildNode, Container, ContainerBase, Declaration } from "postcss";

/**
 * Extract critical rules.
 */
export default postcss.plugin("critical-extract", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    const criticals: Array<ChildNode | ContainerBase> = [];

    css.walk((node: ChildNode): void => {
      // Treat `@critical` nodes.
      if (node.type === "atrule" && node.name === "critical") {
        // Save children nodes.
        node.clone().each((child: ChildNode): void => {
          if (child.type !== "atrule" || child.name !== "critical") {
            criticals.push(child);
          }
        });
      }

      // Treat `critical: this` nodes.
      if (node.type === "decl" && node.prop === "critical" && node.value === "this") {
        const parent: Container = node.parent.clone();

        // Remove all `critical` nodes.
        parent.walkDecls("critical", (decl: Declaration): void => {
          decl.remove();
        });

        // Save current node.
        criticals.push(parent);
      }
    });

    css.removeAll().append(criticals);
  };
});
