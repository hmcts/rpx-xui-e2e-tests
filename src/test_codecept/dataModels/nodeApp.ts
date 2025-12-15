const nodeAppDataModels = {
  getUserDetails_oidc: () => ({
    userInfo: {
      email: "",
      roles: [],
      given_name: "",
      family_name: ""
    },
    roleAssignmentInfo: [],
    canShareCases: false,
    sessionTimeout: { idleModalDisplayTime: 0, pattern: "" }
  })
};

export default nodeAppDataModels;
