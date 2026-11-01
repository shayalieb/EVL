// Shape checks for stage plot write routes. Wrong-typed JSON (a number where
// a name belongs, a string where a scene belongs) used to reach Prisma or
// call .trim() on a non-string and surface as a 500; these let the routes
// answer 400 instead. Shared by the event and library routers, which mirror
// each other.
export const isText = (value) => typeof value === 'string';
export const isNonEmptyText = (value) => typeof value === 'string' && value.trim().length > 0;
export const isSceneObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
export const isChannelNumber = (value) => Number.isInteger(value) && value > 0 && value <= 9999;
