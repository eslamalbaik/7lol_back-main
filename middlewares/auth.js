import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  const header = req.header("Authorization");
  let token = null;

  if (header && header.trim()) {
    const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
    token = bearerMatch ? bearerMatch[1] : header.trim();
  }

  if (!token || token === "undefined" || token === "null") {
    token = req.header("x-access-token");
  }

  if ((!token || token === "undefined" || token === "null") && req.cookies) {
    token = req.cookies.token;
  }

  if (
    (!token || token === "undefined" || token === "null") &&
    (req.query?.token || req.body?.token)
  ) {
    token = req.query?.token || req.body?.token;
  }

  if (!token || token === "undefined" || token === "null")
    return res
      .status(401)
      .json({ message: "لا يوجد رمز وصول (Bearer Token) - الوصول مرفوض" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (e) {
    res.status(401).json({ message: "رمز الوصول غير صالح" });
  }
};

export default auth;
