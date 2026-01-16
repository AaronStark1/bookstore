// controllers/bookController.js (CommonJS, like userController)
const Stripe = require("stripe");
const stripe = new Stripe(process.env.paymentKey); // make sure paymentKey exists in .env

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

  // get user mail from JWT verification
  const userMail = req.payload;
  console.log(userMail);

  try {
    const existingBook = await books.findOne({ title, userMail });
    if (existingBook) {
      return res.status(402).json("Book already existing");
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
  const email = req.payload.userMail; // jwtMiddleware should set req.payload = { userMail, role }

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

    const line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: bookDetails.title,
            description: `${bookDetails.author} | ${bookDetails.publisher}`,
            images: [bookDetails.imageUrl],
            metadata: {
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
              status: "sold",
              userMail: bookDetails.userMail,
              brought: email,
            },
          },
          unit_amount: Math.round(Number(bookDetails.dprice) * 100),
        },
        quantity: 1,
      },
    ];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"], // must be "card", not "cards" [web:211]
      success_url: "http://localhost:5173/payment-success",
      cancel_url: "http://localhost:5173/payment-error",
      line_items,
      mode: "payment",
    });

    res
      .status(200)
      .json({ message: "Success", session, sessionID: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json("Payment Error" + err);
  }
};
