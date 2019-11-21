import postcss, { ContainerBase, Declaration } from "postcss";

/**
 * Normalize revision parameter to make it look like "?rev=xxx".
 */
export default postcss.plugin("postcss-normalize-revision", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    css.walkDecls((decl: Declaration): void => {
      decl.value = decl.value.replace(/(url\('[^\?]+\?)([0-9a-f]+)('\))/, "$1rev=$2$3");
    });
  };
});
