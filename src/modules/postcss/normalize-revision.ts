import postcss from "postcss";

/**
 * Normalize revision parameter to make it look like "?rev=xxx".
 */
export default postcss.plugin("postcss-normalize-revision", (): ((css: any) => void) => {
  return (css: any): void => {
    css.walkDecls((decl: any): void => {
      decl.value = decl.value.replace(/(url\('[^\?]+\?)([0-9a-f]+)('\))/, "$1rev=$2$3");
    });
  };
});
