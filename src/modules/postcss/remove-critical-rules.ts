import postcss from "postcss";

/**
 * Remove critical rules.
 */
export default postcss.plugin("postcss-remove-critical-rules", (): ((css: any) => void) => {
  return (css: any): void => {
    css.walkDecls("critical", (decl: any): void => {
      decl.parent.remove();
    });
  };
});
