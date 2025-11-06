const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const auth = require("../middlewares/auth");

// Create new student
router.post("/", auth, async (req, res) => {
  try {
    const { studentId, name } = req.body;
    const exists = await Student.findOne({ studentId });
    if (exists) return res.status(400).json({ message: "Student ID exists" });
    const student = await Student.create({ studentId, name });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Read all students
router.get("/", auth, async (req, res) => {
  const students = await Student.find();
  res.json(students);
});

// Read single student by Mongo _id
router.get("/:id", auth, async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Not found" });
  res.json(student);
});

// Update student
router.put("/:id", auth, async (req, res) => {
  const student = await Student.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name, studentId: req.body.studentId },
    { new: true }
  );
  res.json(student);
});

// Delete student
router.delete("/:id", auth, async (req, res) => {
  await Student.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

module.exports = router;
