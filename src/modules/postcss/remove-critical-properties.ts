import postcss from "postcss";

/**
 * Remove critical properties.
 */
export default postcss.plugin("postcss-remove-critical-properties", (): ((css: any) => void) => {
  return (css: any): void => {
    css.walkDecls("critical", (decl: any): void => {
      decl.remove();
    });
  };
});
