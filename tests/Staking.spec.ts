import { beginCell, comment, Dictionary, toNano } from '@ton/core';
import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';

import { JettonMasterTemplate } from '../build/Sample/tact_JettonMasterTemplate';
import { JettonWalletTemplate } from '../build/Sample/tact_JettonWalletTemplate';
import { StakeReleaseJettonInfo, StakingMasterTemplate, storeStakeJetton } from '../build/Sample/tact_StakingMasterTemplate';
import { StakingWalletTemplate } from '../build/Sample/tact_StakingWalletTemplate';

describe('Staking', () => {

    let blockchain: Blockchain;

    let stakeMasterContract: SandboxContract<StakingMasterTemplate>;
    let jettonMasterContract: SandboxContract<JettonMasterTemplate>;
    let stakeJettonWallet: SandboxContract<JettonWalletTemplate>;
    let userStakeWallet: SandboxContract<StakingWalletTemplate>;
    let userJettonWallet: SandboxContract<JettonWalletTemplate>;

    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        admin = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');

        jettonMasterContract = blockchain.openContract(
            await JettonMasterTemplate.fromInit(
                admin.address,
                {
                    $$type: "Tep64TokenData",
                    flag: BigInt(1),
                    content: "https://s3.laisky.com/uploads/2024/09/jetton-sample.json",
                },
            )
        );

        stakeMasterContract = blockchain.openContract(
            await StakingMasterTemplate.fromInit(
                admin.address,
            )
        );

        userStakeWallet = blockchain.openContract(
            await StakingWalletTemplate.fromInit(
                stakeMasterContract.address,
                user.address,
            )
        );

        stakeJettonWallet = blockchain.openContract(
            await JettonWalletTemplate.fromInit(
                jettonMasterContract.address,
                stakeMasterContract.address,
            )
        );

        userJettonWallet = blockchain.openContract(
            await JettonWalletTemplate.fromInit(
                jettonMasterContract.address,
                user.address,
            )
        );

        console.log(`admin: ${admin.address}`);
        console.log(`user: ${user.address}`);
        console.log(`stakeMasterContract: ${stakeMasterContract.address}`);
        console.log(`jettonMasterContract: ${jettonMasterContract.address}`);
        console.log(`userStakeWallet: ${userStakeWallet.address}`);
        console.log(`stakeJettonWallet: ${stakeJettonWallet.address}`);
        console.log(`userJettonWallet: ${userJettonWallet.address}`);
    });

    it("prepare jetton", async () => {
        const tx = await jettonMasterContract.send(
            admin.getSender(),
            {
                value: toNano("1"),
                bounce: false,
            },
            {
                $$type: "MintJetton",
                queryId: BigInt(Math.ceil(Math.random() * 1000000)),
                amount: toNano("10"),
                receiver: user.address,
                responseDestination: admin.address,
                forwardAmount: toNano("0.1"),
                forwardPayload: null,
            }
        );
        console.log("prepare jetton");
        printTransactionFees(tx.transactions);

        console.log(`jettonMasterContract deployed at ${jettonMasterContract.address}`);
        console.log(`userJettonWallet: ${userJettonWallet.address}`);

        expect(tx.transactions).toHaveTransaction({
            from: jettonMasterContract.address,
            to: userJettonWallet.address,
            success: true,
            op: 0x178d4519,  // TokenTransferInternal
        });
        expect(tx.transactions).toHaveTransaction({
            from: userJettonWallet.address,
            to: user.address,
            success: true,
            op: 0x7362d09c,  // TransferNotification
        });
        expect(tx.transactions).toHaveTransaction({
            from: userJettonWallet.address,
            to: admin.address,
            success: true,
            op: 0xd53276db,  // Excesses
        });

        const userJettonData = await userJettonWallet.getGetWalletData();
        expect(userJettonData.balance).toEqual(toNano("10"));
    });

    it("staking toncoin", async () => {
        const tx = await stakeMasterContract.send(
            user.getSender(),
            {
                value: toNano("2"),
                bounce: false,
            },
            {
                $$type: "StakeToncoin",
                queryId: BigInt(Math.ceil(Math.random() * 1000000)),
                amount: toNano("0.5"),
                responseDestination: user.address,
                forwardAmount: toNano("0.1"),
                forwardPayload: comment("forward_payload"),
            }
        );
        printTransactionFees(tx.transactions);

        expect(tx.transactions).toHaveTransaction({
            from: user.address,
            to: stakeMasterContract.address,
            success: true,
            op: 0x7ac4404c,  // StakeToncoin
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeMasterContract.address,
            to: userStakeWallet.address,
            success: true,
            op: 0xa576751e,  // StakeInternal
        });
        expect(tx.transactions).toHaveTransaction({
            from: userStakeWallet.address,
            to: user.address,
            success: true,
            op: 0xd53276db,  // Excesses
        });
        expect(tx.transactions).toHaveTransaction({
            from: userStakeWallet.address,
            to: user.address,
            success: true,
            op: 0x2c7981f1,  // StakeNotification
        });

        const userStakedInfo = await userStakeWallet.getStakedInfo();
        expect(userStakedInfo.stakedTonAmount).toEqual(toNano("0.5"));
    });

    it("staking jetton", async () => {
        // const beforeMasterJettonData = await stakeJettonWallet.getBalance();
        // expect(beforeMasterJettonData).toEqual(toNano("0"));

        const beforeUserJettonData = await userJettonWallet.getGetWalletData();
        expect(beforeUserJettonData.balance).toEqual(toNano("10"));

        const tx = await userJettonWallet.send(
            user.getSender(),
            {
                value: toNano("1"),
                bounce: false,
            },
            {
                $$type: "TokenTransfer",
                queryId: BigInt(Math.ceil(Math.random() * 1000000)),
                amount: toNano("1"),
                destination: stakeMasterContract.address,
                responseDestination: user.address,
                forwardAmount: toNano("0.5"),
                forwardPayload: beginCell()
                    .store(storeStakeJetton({
                        $$type: "StakeJetton",
                        tonAmount: toNano("0.1"),
                        responseDestination: user.address,
                        forwardAmount: toNano("0.1"),
                        forwardPayload: comment("forward_payload"),
                    }))
                    .endCell(),
                customPayload: null,
            }
        );
        console.log("staking jetton");
        printTransactionFees(tx.transactions);

        expect(tx.transactions).toHaveTransaction({
            from: user.address,
            to: userJettonWallet.address,
            success: true,
            op: 0xf8a7ea5,  // TokenTransfer
        });
        expect(tx.transactions).toHaveTransaction({
            from: userJettonWallet.address,
            to: stakeJettonWallet.address,
            success: true,
            op: 0x178d4519,  // TokenTransferInternal
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeJettonWallet.address,
            to: user.address,
            success: true,
            op: 0xd53276db,  // Excesses
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeJettonWallet.address,
            to: stakeMasterContract.address,
            success: true,
            op: 0x7362d09c,  // TransferNotification
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeMasterContract.address,
            to: userStakeWallet.address,
            success: true,
            op: 0xa576751e,  // StakeInternal
        });
        expect(tx.transactions).toHaveTransaction({
            from: userStakeWallet.address,
            to: user.address,
            success: true,
            op: 0x2c7981f1,  // StakeNotification
        });
        expect(tx.transactions).toHaveTransaction({
            from: userStakeWallet.address,
            to: user.address,
            success: true,
            op: 0xd53276db,  // Excesses
        });

        const userStakedInfo = await userStakeWallet.getStakedInfo();
        expect(userStakedInfo.stakedTonAmount).toEqual(toNano("0.6"));
        expect(userStakedInfo.stakedJettons.get(stakeJettonWallet.address)!!.jettonAmount).toEqual(toNano("1"));

        const afterMasterJettonData = await stakeJettonWallet.getGetWalletData();
        expect(afterMasterJettonData.balance).toEqual(toNano("1"));

        const afterUserJettonData = await userJettonWallet.getGetWalletData();
        expect(afterUserJettonData.balance).toEqual(toNano("9"));
    });

    it("release", async () => {
        let releaseJettons = Dictionary.empty<bigint, StakeReleaseJettonInfo>();
        releaseJettons.set(BigInt("0"), {
            $$type: "StakeReleaseJettonInfo",
            tonAmount: toNano("0.2"),
            jettonAmount: toNano("1"),
            jettonWallet: stakeJettonWallet.address,
            forwardAmount: toNano("0.1"),
            destination: user.address,
            customPayload: null,
            forwardPayload: comment("forward_payload"),
        });

        const tx = await userStakeWallet.send(
            user.getSender(),
            {
                value: toNano("2"),
                bounce: false,
            },
            {
                $$type: "StakeRelease",
                queryId: BigInt(Math.ceil(Math.random() * 1000000)),
                owner: user.address,
                amount: toNano("0.5"),
                jettons: releaseJettons,
                jettonsIdx: BigInt('1'),
                destination: user.address,
                responseDestination: user.address,
                customPayload: comment("custom_payload"),
                forwardPayload: comment("forward_payload"),
                forwardAmount: toNano("0.1"),
            }
        );
        console.log("release");
        printTransactionFees(tx.transactions);

        expect(tx.transactions).toHaveTransaction({
            from: user.address,
            to: userStakeWallet.address,
            success: true,
            op: 0x51fa3a81,  // StakeRelease
        });
        expect(tx.transactions).toHaveTransaction({
            from: userStakeWallet.address,
            to: stakeMasterContract.address,
            success: true,
            op: 0x51fa3a81,  // StakeRelease
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeMasterContract.address,
            to: user.address,
            success: true,
            op: 0xe656dfa2,  // StakeReleaseNotification
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeMasterContract.address,
            to: user.address,
            success: true,
            op: 0xd53276db,  // Excesses
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeMasterContract.address,
            to: stakeJettonWallet.address,
            success: true,
            op: 0xf8a7ea5,  // TokenTransfer
        });
        expect(tx.transactions).toHaveTransaction({
            from: stakeJettonWallet.address,
            to: userJettonWallet.address,
            success: true,
            op: 0x178d4519,  // TokenTransferInternal
        });
        expect(tx.transactions).toHaveTransaction({
            from: userJettonWallet.address,
            to: user.address,
            success: true,
            op: 0x7362d09c,  // TransferNotification
        });
        expect(tx.transactions).toHaveTransaction({
            from: userJettonWallet.address,
            to: user.address,
            success: true,
            op: 0xd53276db,  // Excesses
        });

        const userStakedInfo = await userStakeWallet.getStakedInfo();
        expect(userStakedInfo.stakedTonAmount).toEqual(toNano("0.1"));
        expect(userStakedInfo.stakedJettons.get(stakeJettonWallet.address)!!.jettonAmount).toEqual(toNano("0"));
    });
});
