import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";
import { ComponentProps } from "react";

export function GoogleReviewsComponent(
  props: ComponentProps<typeof ReactGoogleReviews>) {

  return (

    <ReactGoogleReviews
      {...props}
    />
  );
}

export default GoogleReviewsComponent;
