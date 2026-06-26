import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import candidatesRouter from "./candidates";
import notesRouter from "./notes";
import activitiesRouter from "./activities";
import tagsRouter from "./tags";
import pipelineRouter from "./pipeline";
import searchRouter from "./search";
import importRouter from "./import_route";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(candidatesRouter);
router.use(notesRouter);
router.use(activitiesRouter);
router.use(tagsRouter);
router.use(pipelineRouter);
router.use(searchRouter);
router.use(importRouter);
router.use(usersRouter);

export default router;
