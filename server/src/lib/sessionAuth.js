export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function establishSession(req, identity) {
  await regenerateSession(req);
  Object.assign(req.session, identity);
}
