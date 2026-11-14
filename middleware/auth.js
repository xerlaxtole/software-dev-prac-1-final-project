const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Provider = require('../models/Provider');

//Protect routes: require a valid JWT (Bearer header or httpOnly cookie) and attach req.user
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  //Postman sends the literal string "null" when the token variable is unset; logout sets the cookie to "none"
  if (!token || token === 'null' || token === 'none') {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }
};

//Grant access to specific roles
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `User role ${req.user.role} is not authorized to access this route`,
    });
  }
  next();
};

//Ownership check shared by provider-scoped resources (provider, cars, pick-ups)
exports.canManage = (provider, user) =>
  user.role === 'admin' || (user.role === 'provider' && provider?.owner?.toString() === user.id);

//Route middleware: load :providerId into req.provider (404 if missing); manage=true also requires canManage (403)
exports.loadProvider = (manage) => async (req, res, next) => {
  try {
    req.provider = await Provider.findById(req.params.providerId);
  } catch (err) {
    return res.status(400).json({ success: false, message: `Invalid provider id ${req.params.providerId}` });
  }
  if (!req.provider) {
    return res.status(404).json({ success: false, message: `No provider with the id of ${req.params.providerId}` });
  }
  if (manage && !exports.canManage(req.provider, req.user)) {
    return res.status(403).json({ success: false, message: 'Not authorized to manage this provider' });
  }
  next();
};
