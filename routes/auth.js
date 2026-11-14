const express = require('express');
const router = express.Router();
// const { protect } = require('../middleware/auth');

// TODO (Person A):
//   POST   /register          (name, tel, email, password, role?)        req 1
//   POST   /login                                                        req 2
//   GET    /logout   protect                                             req 2
//   GET    /me       protect                                             req 2
//   DELETE /me       protect   (provider must delete its provider first) req A3

module.exports = router;
