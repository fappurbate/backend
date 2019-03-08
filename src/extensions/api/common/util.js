function errorToObject(error) {
  return {
    message: error.message,
    ...error.type && { type: error.type },
    ...error.data && { data: error.data }
  };
}

module.exports = {
  errorToObject
};
