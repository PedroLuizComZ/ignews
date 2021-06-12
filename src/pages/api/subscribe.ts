import { NextApiRequest, NextApiResponse } from "next";
import { query as q } from "faunadb";
import { getSession } from "next-auth/client";
import { fauna } from "../../services/fauna";
import { stripe } from "../../services/stripe";

type User = {
  ref: {
    id: string;
  };
  data: {
    stripe_custumer_id: string;
  };
};

export default async (request: NextApiRequest, response: NextApiResponse) => {
  if (request.method === "POST") {
    const session = await getSession({ req: request });

    const user = await fauna.query<User>(
      q.Get(q.Match(q.Index("user_by_email"), q.Casefold(session.user.email)))
    );

    let custumerId = user.data.stripe_custumer_id;

    if (!custumerId) {
      const stripeCustumer = await stripe.customers.create({
        email: session.user.email,
      });

      await fauna.query(
        q.Update(q.Ref(q.Collection("users"), user.ref.id), {
          data: {
            stripe_custumer_id: stripeCustumer.id,
          },
        })
      );

      custumerId = stripeCustumer.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: custumerId,
      payment_method_types: ["card"],
      billing_address_collection: "required",
      line_items: [{ price: "price_1Ip16jEaMGoQxy41kqWPsDfc", quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `${process.env.NEXT_PUBLIC_DOMAIN}/posts`,
      cancel_url: `${process.env.NEXT_PUBLIC_DOMAIN}`,
    });

    return response.status(200).json({ sessionId: checkoutSession.id });
  } else {
    response.setHeader("Allow", "POST");
    response.status(405).end("Method Not Allowed");
  }
  return true;
};
