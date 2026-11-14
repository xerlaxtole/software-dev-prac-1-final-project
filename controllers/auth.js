const User = require('../models/User');
const Provider = require('../models/Provider');
const Booking = require('../models/Booking');
const PickupRequest = require('../models/PickupRequest');

//Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  res.status(statusCode).cookie('token', token, options).json({ success: true, token });
};

//@desc     Register user (role: user | provider — admins come from `npm run seed`)
//@route    POST /api/v1/auth/register
//@access   Public
exports.register = async (req, res, next) => {
  try {
    const { name, tel, email, password, role } = req.body;

    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot self-register as admin' });
    }

    const user = await User.create({ name, tel, email, password, role });
    sendTokenResponse(user, 201, res);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Login user
//@route    POST /api/v1/auth/login
//@access   Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide an email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Cannot convert email or password to string' });
  }
};

//@desc     Get current logged in user
//@route    GET /api/v1/auth/me
//@access   Private
exports.getMe = async (req, res, next) => {
  res.status(200).json({ success: true, data: req.user });
};

//@desc     Log user out / clear cookie
//@route    GET /api/v1/auth/logout
//@access   Private
exports.logout = async (req, res, next) => {
  res.cookie('token', 'none', { expires: new Date(Date.now() + 10 * 1000), httpOnly: true });
  res.status(200).json({ success: true, data: {} });
};

//@desc     Delete own account (+ own bookings and pick-up requests)
//@route    DELETE /api/v1/auth/me
//@access   Private                                                       req A3
exports.deleteMe = async (req, res, next) => {
  try {
    //A provider account must delete its provider first, so other users' bookings aren't orphaned silently
    if (await Provider.exists({ owner: req.user._id })) {
      return res.status(409).json({ success: false, message: 'Delete your provider first (DELETE /api/v1/providers/:id)' });
    }

    await PickupRequest.deleteMany({ user: req.user._id });
    await Booking.deleteMany({ user: req.user._id });
    await req.user.deleteOne();

    res.cookie('token', 'none', { expires: new Date(Date.now() + 10 * 1000), httpOnly: true });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
