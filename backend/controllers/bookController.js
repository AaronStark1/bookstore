// controllers/bookController.js (CommonJS, like userController)
const Stripe = require("stripe");
const stripe = process.env.paymentKey ? new Stripe(process.env.paymentKey) : null;

const books = require("../models/bookModel");

// ADD BOOK
exports.addBook = async (req, res) => {
  console.log("Inside add Book");
  console.log(req.body);

  const {
    title,
    author,
    noofpages,
    imageUrl,
    price,
    dprice,
    abstract,
    publisher,
    language,
    isbn,
    category,
  } = req.body;

  // Image file to filename (guard if no files)
  console.log(req.files);
  const UploadedImages = Array.isArray(req.files)
    ? req.files.map((item) => item.filename)
    : [];
  console.log(UploadedImages);

  // get user mail from JWT verification (handles string or decoded payload)
  const userMail = typeof req.payload === 'object' ? req.payload.userMail : (req.payload || req.user?.userMail);
  console.log(userMail);

  try {
    const existingBook = await books.findOne({ title, userMail });
    if (existingBook) {
      return res.status(409).json("Book already existing");
    } else {
      const newBook = new books({
        title,
        author,
        noofpages,
        imageUrl,
        price,
        dprice,
        abstract,
        publisher,
        language,
        isbn,
        category,
        UploadedImages,
        userMail,
      });
      await newBook.save();
      res.status(200).json("Book added successfully...");
    }
  } catch (err) {
    res.status(500).json("Err" + err);
  }
};

// GET ALL BOOKS (with optional search)
exports.getBooks = async (req, res) => {
  const searchKey = req.query.search || "";

  try {
    const query = searchKey
      ? {
          title: {
            $regex: searchKey,
            $options: "i",
          },
        }
      : {};
    const allBooks = await books.find(query);
    res.status(200).json(allBooks);
  } catch (err) {
    res.status(500).json("Error" + err);
  }
};

// HOME BOOKS
exports.getHomeBooks = async (req, res) => {
  try {
    const allBooks = await books.find().sort({ _id: -1 }).limit(4);
    res.status(200).json(allBooks);
  } catch (err) {
    res.status(500).json("Err" + err);
  }
};

// VIEW ONE BOOK
exports.viewBook = async (req, res) => {
  const { id } = req.params;
  try {
    const Book = await books.findOne({ _id: id });
    res.status(200).json(Book);
  } catch (err) {
    res.status(500).json("Err" + err);
  }
};

// BUY BOOK + STRIPE CHECKOUT
exports.buyBook = async (req, res) => {
  const { bookDetails } = req.body;
  if (!bookDetails || !bookDetails._id) {
    return res.status(400).json("Book details are required");
  }

  // Support string payload or object payload
  const email = req.user?.userMail || (typeof req.payload === 'object' ? req.payload.userMail : req.payload);

  if (!stripe) {
    return res.status(500).json("Stripe payment is not configured. Please set paymentKey in .env");
  }

  try {
    // Update book status to sold
    const updatedBook = await books.findByIdAndUpdate(
      bookDetails._id,
      {
        title: bookDetails.title,
        author: bookDetails.author,
        noofpages: bookDetails.noofpages,
        imageUrl: bookDetails.imageUrl,
        price: bookDetails.price,
        dprice: bookDetails.dprice,
        abstract: bookDetails.abstract,
        publisher: bookDetails.publisher,
        language: bookDetails.language,
        isbn: bookDetails.isbn,
        category: bookDetails.category,
        UploadedImages: bookDetails.UploadedImages,
        status: "sold",
        userMail: bookDetails.userMail,
        brought: email,
      },
      { new: true }
    );

    if (!updatedBook) {
      return res.status(404).json("Book not found");
    }

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    const line_items = [
      {
        price_data: {
          currency: "inr",
          product_data: {
            name: bookDetails.title,
            description: `${bookDetails.author} | ${bookDetails.publisher}`,
            images: bookDetails.imageUrl ? [bookDetails.imageUrl] : [],
            metadata: {
              title: bookDetails.title,
              author: bookDetails.author,
              noofpages: String(bookDetails.noofpages || ""),
              imageUrl: bookDetails.imageUrl || "",
              price: String(bookDetails.price || ""),
              dprice: String(bookDetails.dprice || ""),
              abstract: bookDetails.abstract ? bookDetails.abstract.slice(0, 450) : "",
              publisher: bookDetails.publisher || "",
              language: bookDetails.language || "",
              isbn: bookDetails.isbn || "",
              category: bookDetails.category || "",
              status: "sold",
              userMail: bookDetails.userMail || "",
              brought: email || "",
            },
          },
          unit_amount: Math.round(Number(bookDetails.dprice) * 100),
        },
        quantity: 1,
      },
    ];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"], // must be "card", not "cards"
      success_url: `${clientUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment-error`,
      line_items,
      mode: "payment",
    });

    res
      .status(200)
      .json({ message: "Success", session, sessionID: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json("Payment Error: " + err.message);
  }
};
