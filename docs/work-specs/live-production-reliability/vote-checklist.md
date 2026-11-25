# Vote checklist for a live event

For the operator running a phone vote on the day. The words in quotes are what the screen says.

## Before doors open

1. **Publish the production** after the last change, so the join link and the result graphic are on
   the outputs.
2. **Test the join link and the QR on the venue wifi**, with two phones: one on the venue wifi and
   one on mobile data. Scan the QR from the screen it will be shown on, at the distance the audience
   will sit. Each phone should show the production's name within a few seconds.
3. **Run a test vote**: Go live on a test question, have both phones tap an option and press
   **Vote**. Each phone must then show "Your vote: A ..." (the letter and the option). Check that the
   panel's count went up by two. Stop, then delete the test question or use **Start a new count**
   before the real vote.
4. **Decide per question whether a vote can change.** "Allow changing a vote" is on by default:
   people can change their vote until you press Stop. Untick it only when the first vote must stand.

## During the vote

5. **Tell the room: tap an option, then press Vote.** A tap alone only picks; nothing is sent until
   Vote is pressed. Ask people to check that their phone says "Your vote: ...".
6. **Read the count on the panel** (Interaction, the live question): each option's count and share,
   and the total under them. It updates every two seconds. The count is final when you press
   **Stop**.
7. **Air the result** with **Add results to rundown**, then Take its cue. Press it again after Stop so
   the graphic carries the final numbers and says voting closed.

## Going live again on the same question

8. Go live on a question that already has votes asks what to do:
   - **Continue the count**: the votes so far still count, and phones keep showing their vote. Use it
     after a short pause in the same vote (a break, a mistake with Stop).
   - **Start a new count**: starts from zero; everyone votes again. Use it when the question is asked
     again as a new vote (a second half, a revote). The earlier count is kept under "Earlier counts"
     with its own CSV.

## When a phone says something else

9. **"Not sent. Check your connection and try again."** The vote did not reach us. Press **Vote**
   again. If it keeps saying so, move closer to the wifi or switch to mobile data, then press Vote.
   Nothing is counted until the phone says "Your vote: ...".
10. **"Too many votes at once. Try again in a few seconds."** More than 3000 votes in ten seconds on
    this question. Wait a few seconds and press Vote again.
11. **"That question has closed."** You pressed Stop or moved to another question before the vote
    arrived. It was not counted.
12. **"Your vote is already in."** The question does not allow changing a vote, and this phone has
    voted.

## After the show

13. **Export votes (CSV)** on each vote and on each earlier count, to keep the result. One row per
    vote: time, option, answer, source and a voter key that is not the phone.
