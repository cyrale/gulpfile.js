import postcss from "postcss";

/**
 * Make critical properties hierarchical (PostCSS plugin).
 */
export default postcss.plugin("postcss-hierarchical-critical", (): ((css: any) => void) => {
  return (css: any): void => {
    css.walkDecls("critical", (decl: any): void => {
      decl.parent.nodes
        .filter((node: any): boolean => node.type === "rule" || node.type === "atrule")
        .forEach((node: any): void => {
          node.append({ prop: "critical", value: "this" });
        });
    });
  };
});
