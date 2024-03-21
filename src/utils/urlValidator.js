export const urlValidator = {
  validator: function (v) {
    return /^(ftp|http|https):\/\/[^ "]+$/.test(v);
  },
  message: (props) => `${props.value} is not a valid URL!`,
};
