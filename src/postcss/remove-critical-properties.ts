import postcss, { ContainerBase, Declaration } from "postcss";

/**
 * Remove critical properties.
 */
export default postcss.plugin("postcss-remove-critical-properties", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    css.walkDecls("critical", (decl: Declaration): void => {
      decl.remove();
    });
  };
});
