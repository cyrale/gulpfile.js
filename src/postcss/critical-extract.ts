import postcss, { ChildNode, Container, ContainerBase, Declaration } from "postcss";

/**
 * Extract critical rules.
 */
export default postcss.plugin("critical-extract", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    const criticals: Array<ChildNode | ContainerBase> = [];

    css.walk((node: ChildNode): void => {
      if (node.type === "atrule" && node.name === "critical") {
        node.clone().each((child: ChildNode): void => {
          if (child.type !== "atrule" || child.name !== "critical") {
            criticals.push(child);
          }
        });
      }

      if (node.type === "decl" && node.prop === "critical" && node.value === "this") {
        const parent: Container = node.parent.clone();

        parent.walkDecls("critical", (decl: Declaration): void => {
          decl.remove();
        });

        criticals.push(parent);
      }
    });

    css.removeAll().append(criticals);
  };
});
