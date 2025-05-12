import React from 'react';
import { useForm, ValidationError } from '@formspree/react';
import styles from './contactform.module.scss';

function ContactForm() {
  const [state, handleSubmit] = useForm(process.env.NEXT_PUBLIC_FORM);
  if (state.succeeded) {
    return <p>Thanks for contacting!</p>;
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <label htmlFor="email">Email Address</label>
      <input id="email" type="email" name="email" required/>
      <ValidationError prefix="Email" field="email" errors={state.errors} />
      <label htmlFor="message">Message</label>
      <textarea id="message" name="message" required/>
      <ValidationError prefix="Message" field="message" errors={state.errors} />

      <button className="button" type="submit" disabled={state.submitting}>
        Submit
      </button>
    </form>
  );
}

function App() {
  return <ContactForm />;
}

export default App;
