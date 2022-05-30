import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"
import { Contract, providers, utils } from "ethers"
import Head from "next/head"
import React from "react"
import styles from "../styles/Home.module.css"
import { useForm, SubmitHandler } from "react-hook-form";
import { object, string, number } from 'yup';

type Inputs = {
    name: string,
    age: number,
    address: string,
};

const userSchema = object({
    name: string().required(),
    age: number().required().positive().integer(),
    address: string().required(),
});


export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    const [newGreetings, setNewGreetings] = React.useState<string[]>([]);

    const { register, handleSubmit, watch, formState: { errors } } = useForm<Inputs>();
    // const onSubmit: SubmitHandler<Inputs> = data => console.log(data);

    console.log(watch()) // watch input value by passing the name of it

    async function listen() {
        const filter = {
            address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
            topics: [
                // the name of the event, parnetheses containing the data type of each event, no spaces
                utils.id("NewGreeting(bytes32)")
            ]
        }
        const provider = new providers.JsonRpcProvider("http://localhost:8545")
        const contract = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", Greeter.abi, provider)


        contract.on(filter, (log, event) => {
            // console.log(log);
            // console.log(typeof log);
            if (!newGreetings.includes(log)) {
                setNewGreetings([...newGreetings, log])
            }
        });

    }

    listen();

    async function greet() {
        setLogs("Creating your Semaphore identity...")

        // parse and assert validity
        const user = await userSchema.validate(watch());
        console.log(user);

        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })
        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = `Hello world from + ${watch('name')}`;

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        console.log('Greenting should be:', greeting);

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
        }
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>A simple Next.js/Hardhat privacy application with Semaphore.</p>

                <div className={styles.logs}>{logs}</div>

                <form className={styles.form}>
                    <label className={styles.description} >Name</label><br></br>
                    <input className={styles.inputBox} placeholder="Name" {...register("name")} />
                    <br />
                    <label className={styles.description}>Age</label><br></br>
                    <input className={styles.inputBox} placeholder="Age" type="number" {...register("age", { required: true })} />
                    {/* {errors.age && <span>This field is required</span>} */}
                    <br />
                    <label className={styles.description}>Address</label><br></br>
                    <input className={styles.inputBox} placeholder="0x" type="text" {...register("address", { required: true })} />
                    {/* {errors.address && <span>This field is required</span>} */}
                    <br />
                    {/* <input type="submit"></input> */}
                    <br />
                </form>
                <div onClick={() => greet()} className={styles.button}>
                    Greet
                </div>

                <br />

                <div>
                    {newGreetings.map((e, i) => <div key={i}>
                        <p className={styles.description}>{e}</p>
                        <p className={styles.description}>{utils.parseBytes32String(e)}</p>
                        <br />
                    </div>)}
                </div>


            </main>
        </div>
    )
}
