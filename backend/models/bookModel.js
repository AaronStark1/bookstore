//import mongoose
const mongoose = require("mongoose");

//Create schema and model
const bookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  author: {
    type: String,
    required: true,
  },
  noofpages: {
    type: Number,
    required: true,
  },
  // Optional: without an image the frontend draws the cover from `design`
  // (or from the title when there is no design either).
  imageUrl: {
    type: String,
    default: "",
  },
  price: {
    type: Number,
    required: true,
  },
  dprice: {
    type: Number,
    required: true,
  },
  abstract: {
    type: String,
    required: true,
  },
  publisher: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    required: true,
  },
  isbn: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  UploadedImages: {
    type: Array,
    required: true,
  },
  status: {
    type: String,
    default: "pending",
  },
  userMail: {
    type: String,
    required: true,
  },
  brought: {
    type: String,
    default: "",
  },
  // Optional presentation fields, used by the seeded folios (seed/specimens.json).
  year: Number,
  edition: String,
  // { no, motif, palette: { bg, ink, accent, accent2 }, cloth, foil } for the procedural cover and spine.
  design: mongoose.Schema.Types.Mixed,
});

module.exports = mongoose.model("books", bookSchema);