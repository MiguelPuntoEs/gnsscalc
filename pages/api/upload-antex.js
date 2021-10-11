
export default async function uploadANTEX(req, res) {

    const data = await fetch("http://localhost:5000/upload-antex", {
        method: "POST",
        headers: req.headers,
        body: req.body
    }).then(r=>r.json())

   res.send(data)
}