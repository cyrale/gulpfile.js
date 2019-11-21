import postcss, { ContainerBase, Declaration } from "postcss";

/**
 * Remove critical rules.
 */
export default postcss.plugin("postcss-remove-critical-rules", (): ((css: ContainerBase) => void) => {
  return (css: ContainerBase): void => {
    css.walkDecls("critical", (decl: Declaration): void => {
      decl.parent.remove();
    });
  };
});
