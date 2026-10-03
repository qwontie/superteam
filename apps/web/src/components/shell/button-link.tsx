import { Button, type ButtonProps } from "@cladd-ui/react";
import { createLink } from "@tanstack/react-router";

function AnchorButton(props: ButtonProps<"a">) {
  return <Button as="a" {...props} />;
}

export const ButtonLink = createLink(AnchorButton);
