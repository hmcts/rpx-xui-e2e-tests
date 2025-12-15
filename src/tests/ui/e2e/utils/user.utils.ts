import { UserUtils as SharedUserUtils } from "../../../../utils/ui/user.js";

export class UserUtils {
  private readonly delegate = new SharedUserUtils();

  public getUserCredentials(userIdentifier: string): { email: string; password: string } {
    const user = this.delegate.getUserCredentials(userIdentifier);
    return { email: user.username, password: user.password };
  }
}
