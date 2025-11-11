import bcrypt from "bcrypt";
import Admin from "../models/Admin.js";

async function createAdmin() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return;
  const existing = await Admin.findOne({ username: ADMIN_USERNAME });
  if (existing) return;
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await Admin.create({ username: ADMIN_USERNAME, password: hashed });
  console.log("🔒 Default admin account created");
}
export default createAdmin;
